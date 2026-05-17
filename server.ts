import { createServer } from "http";
import next from "next";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  httpServer.keepAliveTimeout = 0;
  httpServer.headersTimeout = 0;

  httpServer.listen(port, () => {
    console.log(
      `> Server listening at http://localhost:${port} [${dev ? "development" : "production"}]`
    );
  });
});
