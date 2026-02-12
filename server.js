require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const Request = require("./models/Request");
const EndpointConfig = require("./models/EndpointConfig");

const app = express();
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB", err));

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

// Body Parsing Middleware - Capture Everything and preserve raw body
const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || "utf8");
  }
};

app.use(bodyParser.json({ verify: rawBodySaver }));
app.use(bodyParser.urlencoded({ extended: true, verify: rawBodySaver }));
app.use(bodyParser.text({ verify: rawBodySaver }));
app.use(bodyParser.raw({ type: "*/*", verify: rawBodySaver }));

// --- Routes ---

// Home Route
app.get("/", (req, res) => {
  res.render("home");
});

// View Route - The UI
app.get("/view/:endpointId", (req, res) => {
  res.render("index", { endpointId: req.params.endpointId });
});

// API Route - Get Requests for an Endpoint (with Pagination)
app.get("/api/requests/:endpointId", async (req, res) => {
  const { endpointId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const requests = await Request.find({ endpointId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Request.countDocuments({ endpointId });

    res.json({
      requests,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRequests: total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch requests" });
  }
});

// API Route - Delete a Request
app.delete("/api/requests/:id", async (req, res) => {
  try {
    const result = await Request.findByIdAndDelete(req.params.id);
    if (result) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Request not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete request" });
  }
});

// API Route - Get Endpoint Config
app.get("/api/config/:endpointId", async (req, res) => {
  try {
    let config = await EndpointConfig.findOne({
      endpointId: req.params.endpointId,
    });
    if (!config) {
      // Default config
      config = {
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: "Livehook Received",
        delay: 0,
      };
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// API Route - Save Endpoint Config
app.post("/api/config/:endpointId", async (req, res) => {
  try {
    const configData = req.body;
    const { endpointId } = req.params;

    const updated = await EndpointConfig.findOneAndUpdate(
      { endpointId },
      { ...configData, endpointId },
      { upsert: true, new: true, returnDocument: "after" },
    );

    res.json(updated);
  } catch (error) {
    console.error("Save config error:", error);
    res.status(500).json({ error: "Failed to save config" });
  }
});

// SSE Clients
let clients = [];

// SSE Endpoint
app.get("/events/:endpointId", (req, res) => {
  const { endpointId } = req.params;

  // SSE Headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const clientId = Date.now();
  console.log(`SSE Client connected: ${clientId} for endpoint ${endpointId}`);

  const newClient = {
    id: clientId,
    endpointId,
    res,
  };

  clients.push(newClient);

  // Send initial connection message
  res.write(": connected\n\n");

  // Heartbeat every 15 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    console.log(`SSE Client disconnected: ${clientId}`);
    clearInterval(heartbeat);
    clients = clients.filter((c) => c.id !== clientId);
  });
});

const getLocation = async (ip) => {
  if (
    !ip ||
    ip === "::1" ||
    ip === "127.0.0.1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.")
  ) {
    return { city: "Local", country: "Network", isLocal: true };
  }
  try {
    const response = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city`,
    );
    const data = await response.json();
    if (data.status === "success") {
      return {
        city: data.city,
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
      };
    }
  } catch (error) {
    console.error("IP Geolocation error:", error);
  }
  return null;
};

const filterHeaders = (rawHeaders) => {
  const filtered = {};
  const ignorePrefixes = ["x-vercel-", "x-forwarded-", "x-real-"];
  const ignoreExact = ["forwarded", "via", "connect-install-id", "purpose"];

  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i];
    const value = rawHeaders[i + 1];
    const lowKey = key.toLowerCase();

    const shouldIgnore =
      ignorePrefixes.some((prefix) => lowKey.startsWith(prefix)) ||
      ignoreExact.includes(lowKey);

    if (!shouldIgnore) {
      filtered[key] = value;
    }
  }
  return filtered;
};

// Ingestion Route - Capture All Requests to an Endpoint
app.all(/^\/([a-zA-Z0-9_\-]+)(.*)/, async (req, res) => {
  const endpointId = req.params[0];
  const path = req.params[1] || "";

  // Ignore favicon requests
  if (endpointId === "favicon.ico") return res.sendStatus(404);

  // Default response object (Fallback)
  let responseData = {
    status: 200,
    headers: { "Content-Type": "text/plain" },
    body: "Livehook Received",
    delay: 0,
  };

  // Load configuration from DB
  try {
    const savedConfig = await EndpointConfig.findOne({ endpointId });
    if (savedConfig) {
      responseData = {
        status: savedConfig.status,
        headers: savedConfig.headers,
        body: savedConfig.body,
        delay: savedConfig.delay,
      };
    }
  } catch (e) {
    console.error("Error loading endpoint config:", e);
  }

  // Allow configuring the response via headers or query params (Overrides saved config)
  if (req.headers["x-response-status"]) {
    const status = parseInt(req.headers["x-response-status"]);
    if (!isNaN(status)) responseData.status = status;
  } else if (req.query["response-status"]) {
    const status = parseInt(req.query["response-status"]);
    if (!isNaN(status)) responseData.status = status;
  }

  // Simulate Delay
  let delay = 0;
  if (req.headers["x-response-delay"]) {
    delay = parseInt(req.headers["x-response-delay"]);
  } else if (responseData.delay) {
    delay = parseInt(responseData.delay);
  }

  if (delay > 0 && !isNaN(delay)) {
    await new Promise((r) => setTimeout(r, delay));
  }

  const location = await getLocation(req.ip);

  try {
    const requestDoc = new Request({
      endpointId,
      method: req.method,
      path: path,
      url: req.originalUrl,
      headers: filterHeaders(req.rawHeaders),
      query: req.query,
      body: req.body,
      rawBody: req.rawBody || "",
      ip: req.ip,
      location: location,
      response: responseData,
    });

    const newRequest = await requestDoc.save();

    // Notify clients for this endpoint
    const clientCount = clients.filter(
      (c) => c.endpointId === endpointId,
    ).length;
    console.log(
      `New request for ${endpointId}. Notifying ${clientCount} clients.`,
    );

    clients.forEach((client) => {
      if (client.endpointId === endpointId) {
        client.res.write(`data: ${JSON.stringify(newRequest)}\n\n`);
      }
    });

    // Respond to the livehook sender
    res.set(responseData.headers);
    res.status(responseData.status).send(responseData.body);
  } catch (error) {
    console.error("Error saving request:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `View your livehook at: http://localhost:${PORT}/view/YOUR_ENDPOINT_ID`,
  );
});
