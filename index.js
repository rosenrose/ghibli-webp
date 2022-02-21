const http = require("http");
const express = require("express");

const app = express();
app.get("/", (req, res) => res.send("<h1>Test</h1>"));

const httpServer = http.createServer(app);
httpServer.listen(process.env.PORT || 3000);
