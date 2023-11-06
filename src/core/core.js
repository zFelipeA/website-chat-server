export default class Core {
    constructor(Socket) {
        this.socket = new Socket();
    }

    init = () => {
        this.socket.init();
    };
}
