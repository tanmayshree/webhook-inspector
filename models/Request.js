const mongoose = require("mongoose");

const RequestSchema = new mongoose.Schema({
  endpointId: {
    type: String,
    required: true,
    index: true,
  },
  method: {
    type: String,
    required: true,
  },
  path: {
    type: String,
    default: "",
  },
  url: {
    type: String,
    default: "",
  },
  headers: {
    type: Object,
    default: {},
  },
  query: {
    type: Object,
    default: {},
  },
  body: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  rawBody: {
    type: String,
    default: "",
  },
  ip: {
    type: String,
  },
  location: {
    type: Object,
    default: null,
  },
  response: {
    status: Number,
    headers: Object,
    body: String,
    delay: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("Request", RequestSchema);
