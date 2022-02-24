const http = require("http");
const express = require("express");
const axios = require("axios").default;
const createFFmpeg = require("./customCreateFFmpeg");
const ffmpegList = [];
while (ffmpegList.length < 6) {
  ffmpegList.push(createFFmpeg());
}

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

io.on("connection", async (socket) => {
  for (let i = 0; ; i = (i + 1) % ffmpegList.length) {
    if (ffmpegList[i].isLoaded()) {
      if (ffmpegList[i].isRunning() || ffmpegList[i].selected) {
        console.log(i, "running");
        continue;
      } else {
        ffmpegList[i].selected = true;
        console.log(i, "ready");
        socket.emit("ready", i);
        break;
      }
    } else {
      console.log(i, "load");
      await ffmpegList[i].load();
      ffmpegList[i].FS("mkdir", "webp");
      ffmpegList[i].setProgress((progress) => {
        socket.emit("progress", progress);
      });
      // ffmpegList[i].setLogger((log) => {
      //   const { type, message } = log;
      //   // if (log.type == "fferr") {
      //   // socket.emit("log", log);
      //   console.log(id, `[${type}] ${message}`);
      //   // }
      // });
      socket.emit("ready", i);
      break;
    }
  }

  socket.on("webp", (i, params, done) => {
    runWebp(ffmpegList[i], params, socket).then((webp) => {
      done(webp);
      clear(ffmpegList[i]);
      ffmpegList[i].selected = false;
    });
  });

  socket.on("disconnect", () => {
    ffmpegList
      .filter((ffmpeg) => ffmpeg.isLoaded() && !ffmpeg.isRunning())
      .forEach((ffmpeg) => {
        clear(ffmpeg);
        ffmpeg.selected = false;
      });
  });

  socket.on("test", () => {
    ffmpegList.push(createFFmpeg());
    ffmpegList.at(-1).load();
    console.log(ffmpegList.length);
  });
});

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
