import { createServer } from "http";
import { WebSocketServer } from "ws";
import next from "next";
import { handleConnection } from "./lib/ws/handler";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Use noServer so we can manually route upgrades by path,
  // preventing conflicts with Next.js HMR WebSocket traffic.
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    handleConnection(ws);
  });

  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // All other upgrade requests (Next.js HMR, etc.) are left to Next.js.
  });

  httpServer.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} [${dev ? "development" : "production"}]`
    );
  });
});
