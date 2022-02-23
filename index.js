const http = require("http");
const express = require("express");
const axios = require("axios").default;
const { createFFmpeg, fetchFile } = require("@ffmpeg/ffmpeg");

const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.send(`<h1>Test port: ${PORT}</h1>`);
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
  const ffmpeg = createFFmpeg({ log: true });

  if (!ffmpeg.isLoaded()) {
    ffmpeg.load().then(() => {
      socket.emit("load");
      ffmpeg.FS("mkdir", "webp");
      ffmpeg.setProgress((progress) => {
        socket.emit("progress", progress);
      });
    });
  }

  socket.on("webp", (params, done) => {
    runWebp(params, socket).then((webp) => {
      done(webp);
      clear();
    });
  });

  socket.on("disconnecting", () => {
    ffmpeg.exit();
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
  ffmpeg
    .FS("readdir", "webp")
    .filter((dir) => !dir.startsWith("."))
    .forEach((dir) => {
      ffmpeg
        .FS("readdir", `webp/${dir}`)
        .filter((file) => !file.startsWith("."))
        .forEach((file) => {
          ffmpeg.FS("unlink", `webp/${dir}/${file}`);
        });
      ffmpeg.FS("rmdir", `webp/${dir}`);
    });
}

function getRandomInt(minInclude, maxExclude) {
  return Math.floor(Math.random() * (maxExclude - minInclude)) + minInclude;
}
