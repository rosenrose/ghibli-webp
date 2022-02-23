const http = require("http");
const express = require("express");
const axios = require("axios").default;

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
  const FFmpeg = requireUncached("@ffmpeg/ffmpeg", socket.id);
  console.log(FFmpeg.sid, "connected");
  const { createFFmpeg, fetchFile } = FFmpeg;
  const ffmpeg = createFFmpeg({ log: false });

  if (!ffmpeg.isLoaded()) {
    ffmpeg.load().then(() => {
      ffmpeg.FS("mkdir", "webp");
      ffmpeg.setProgress((progress) => {
        progress.id = FFmpeg.sid;
        socket.emit("progress", progress);
      });
      ffmpeg.setLogger((log) => {
        if (log.type == "fferr") {
          console.log(FFmpeg.sid, log.message);
        }
      });
      socket.emit("load");
    });
  }

  socket.on("webp", (params, done) => {
    runWebp(ffmpeg, params, socket).then((webp) => {
      done(webp);
      clear(ffmpeg);
    });
  });

  socket.on("disconnect", () => {
    clear(ffmpeg);
  });
});

function handleProgress(progress) {}

async function runWebp(ffmpeg, params, socket) {
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

function clear(ffmpeg) {
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

function requireUncached(module, sid) {
  // console.log("before", Object.keys(require.cache).length);
  // console.log(require.cache[require.resolve(module)]);
  delete require.cache[require.resolve(module)];
  // console.log("after", Object.keys(require.cache).length);
  let temp = require(module);
  temp.sid = sid;
  return temp;
}
