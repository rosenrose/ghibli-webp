const fs = require("fs");
const http = require("http");
const express = require("express");
const axios = require("axios").default;
const exec = require("child_process").exec;
const util = require("util");
console.log();
const p = exec(`ffmpeg -i`, (err) => {});
// const p = exec(`ffmpeg -i "C:/Users/crazy/Pictures/Saved Pictures/15a2cdeab5831898ss1.jpg" 1.png -y`, (err) => {});
p.stdout.on("data", (msg) => console.log("out\n", msg));
// p.stderr.on("data", (msg) => console.log("err\n", util.inspect([...msg], { maxArrayLength: null })));
p.stderr.on("data", (msg) =>
  console.log(
    "err\n",
    msg.split("\r\n").filter((a) => a.length)
  )
);

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.send(`<h1>Test port: ${PORT}</h1>`);
});
app.get("/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
});

const httpServer = http.createServer(app);
httpServer.listen(PORT);

const io = require("socket.io")(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

try {
  fs.mkdirSync("webp");
} catch (e) {}

io.on("connection", (socket) => {
  socket.on("webp", (params, done) => {
    runWebp(params, socket).then((webp) => {
      done(webp);
      clear();
    });
  });

  socket.on("disconnect", () => {
    clear();
  });
});

async function runWebp(params, socket) {
  const { time, title, cut, duration, webpGif, cloud, webpWidth, gifWidth } = params;
  const downloadPromises = [];
  let downloadCount = 1;

  ffmpeg.FS("mkdir", `webp/${time}`);
  for (let i = 0; i < Math.min(parseInt(duration), 84); i++) {
    const filename = `${(cut + i).toString().padStart(5, "0")}.jpg`;

    downloadPromises.push(
      new Promise((resolve) => {
        axios(encodeURI(`${cloud}/${title}/${filename}`), {
          responseType: "arraybuffer",
        }).then((response) => {
          ffmpeg.FS("writeFile", `webp/${time}/${filename}`, response.data);
          socket.emit("download", downloadCount++);
          resolve();
        });
      })
    );
  }

  const command =
    webpGif === "webp"
      ? ["-vf", `scale=${webpWidth}:-1`, "-loop", "0", "-preset", "drawing", "-qscale", "90"]
      : ["-lavfi", `split[a][b];[a]scale=${gifWidth}:-1,palettegen[p];[b]scale=${gifWidth}:-1[g];[g][p]paletteuse`];

  await Promise.all(downloadPromises);
  await ffmpeg.run(
    "-framerate",
    "12",
    "-pattern_type",
    "glob",
    "-i",
    `webp/${time}/*.jpg`,
    ...command,
    `webp/${time}/output.${webpGif}`
  );

  return ffmpeg.FS("readFile", `webp/${time}/output.${webpGif}`).buffer;
}

function clear() {
  fs.readdirSync("webp").forEach((dir) => {});
}

function getRandomInt(minInclude, maxExclude) {
  return Math.floor(Math.random() * (maxExclude - minInclude)) + minInclude;
}
