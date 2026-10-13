import ELK from "elkjs/lib/elk-api";
import ElkWorker from "elkjs/lib/elk-worker.min.js?worker";

export const layoutEngine = new ELK({ workerFactory: () => new ElkWorker() });
