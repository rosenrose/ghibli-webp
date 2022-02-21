const http = require("http");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send(`<h1>Test port: ${PORT}</h1>`));

const httpServer = http.createServer(app);
httpServer.listen(PORT);
