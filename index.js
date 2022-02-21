const http = require("http");
const express = require("express");

const app = express();
app.get("/", (req, res) => res.send("<h1>Test</h1>"));
app.listen(80);
