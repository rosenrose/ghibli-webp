const http = require("http");
const express = require("express");
const axios = require("axios").default;
const pathToFfmpeg = require("ffmpeg-static");
const spawn = require("child_process").spawn;
const decoder = new TextDecoder();

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

io.on("connection", (socket) => {
  socket.on("webp", (params, done) => {
    runWebp(params, socket).then((webp) => {
      done(webp);
    });
  });
});

async function runWebp(params, socket) {
  const { title, cut, duration, webpGif, cloud, webpWidth, gifWidth } = params;

  const command =
    webpGif === "webp"
      ? ["-vf", `scale=${webpWidth}:-1`, "-loop", "0", "-preset", "drawing", "-qscale", "90"]
      : ["-lavfi", `split[a][b];[a]scale=${gifWidth}:-1,palettegen[p];[b]scale=${gifWidth}:-1[g];[g][p]paletteuse`];
  // prettier-ignore
  const ffmpeg = spawn(pathToFfmpeg, [
    "-framerate", "12",
    "-f", "jpeg_pipe",
    "-i", "pipe:",
    ...command,
    "-f", "webp",
    "-c:v", "webp",
    "pipe:1"
  ]);

  let webpBuffer = [];
  let size = 0;
  ffmpeg.stdout.on("data", (data) => {
    // console.log((size += data.length));
    webpBuffer = [...webpBuffer, ...data];
  });
  ffmpeg.stderr.on("data", (msg) => {
    const progress = parseMessage(decoder.decode(msg));
    if (progress) {
      socket.emit("progress", progress);
    }
  });

  const downloadPromises = [];
  let downloadCount = 1;
  for (let i = 0; i < Math.min(parseInt(duration), 84); i++) {
    const filename = `${(cut + i).toString().padStart(5, "0")}.jpg`;

    downloadPromises.push(
      new Promise((resolve) => {
        axios(encodeURI(`${cloud}/${title}/${filename}`), {
          responseType: "arraybuffer",
        }).then((response) => {
          socket.emit("download", downloadCount++);
          resolve(response.data);
        });
      })
    );
  }

  for (let download of downloadPromises) {
    const jpg = await download;
    ffmpeg.stdin.write(jpg);
  }
  ffmpeg.stdin.end();

  return new Promise((resolve) => {
    ffmpeg.on("close", () => {
      resolve(webpBuffer);
    });
  });
}

function getRandomInt(minInclude, maxExclude) {
  return Math.floor(Math.random() * (maxExclude - minInclude)) + minInclude;
}

function ts2sec(ts) {
  const [h, m, s] = ts.split(":");
  return parseFloat(h) * 60 * 60 + parseFloat(m) * 60 + parseFloat(s);
}

function parseMessage(message) {
  let progress;

  if (message.startsWith("frame")) {
    // console.log(message);
    const frame = message.split(" fps=")[0].split("frame=")[1].trim();
    const ts = message.split("time=")[1].split(" ")[0];
    const time = ts2sec(ts);
    const speed = message.split("speed=")[1].split(" ")[0];
    progress = { frame, time, speed };
  }

  return progress;
}
