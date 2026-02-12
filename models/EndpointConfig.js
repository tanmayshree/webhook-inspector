const mongoose = require("mongoose");

const EndpointConfigSchema = new mongoose.Schema({
  endpointId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: Number,
    default: 200,
  },
  headers: {
    type: Object,
    default: { "Content-Type": "text/plain" },
  },
  body: {
    type: String,
    default: "Livehook Received",
  },
  delay: {
    type: Number,
    default: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field on save
EndpointConfigSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("EndpointConfig", EndpointConfigSchema);
