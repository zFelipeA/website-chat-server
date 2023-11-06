import Core from "./core/core.js";
import Socket from "./modules/socket.js";

const core = new Core(Socket);
core.init();
