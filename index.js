const fs = require("fs");
const http = require("http");
const express = require("express");
const axios = require("axios").default;
const { createFFmpeg, fetchFile } = require("@ffmpeg/ffmpeg");
const ffmpeg = createFFmpeg({ log: true });
ffmpeg.load();

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.send(`<h1>Test port: ${PORT}</h1>`));

const httpServer = http.createServer(app);
httpServer.listen(PORT);

const io = require("socket.io")(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  socket.on("webp", async (done) => {
    const time = Date.now().toString();
    const rand = getRandomInt(100, 1000);
    const outputName = "a.webp";
    const downloadPromises = [];

    ffmpeg.FS("mkdir", time);
    for (let i = 0; i < 18; i++) {
      let name = `${(rand + i).toString().padStart(5, "0")}.jpg`;

      downloadPromises.push(
        new Promise((resolve) => {
          axios(encodeURI(`https://d2wwh0934dzo2k.cloudfront.net/ghibli/07 붉은 돼지 (1992)/${name}`), {
            responseType: "arraybuffer",
          }).then((response) => {
            ffmpeg.FS("writeFile", `${time}/${name}`, response.data);
            resolve();
          });
        })
      );
    }
    await Promise.all(downloadPromises);
    await ffmpeg.run(
      "-framerate",
      "12",
      "-pattern_type",
      "glob",
      "-i",
      `${time}/*.jpg`,
      "-vf",
      "scale=720:-1",
      "-loop",
      "0",
      `${time}/${outputName}`
    );
    const webp = ffmpeg.FS("readFile", `${time}/${outputName}`);
    done(webp);
  });
});

function getRandomInt(minInclude, maxExclude) {
  return Math.floor(Math.random() * (maxExclude - minInclude)) + minInclude;
}
