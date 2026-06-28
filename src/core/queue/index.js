// Queue system disabled — semua plugin dipanggil langsung tanpa antrian
// untuk menghilangkan delay pada respons bot.

class TaskQueue {
    constructor() {}
    async add(taskFn) { return taskFn(); }
}

class QueueManager {
    constructor() { this.queues = new Map(); }
    get(name) {
        if (!this.queues.has(name)) this.queues.set(name, new TaskQueue());
        return this.queues.get(name);
    }
    add(name, taskFn) { return taskFn(); }
}

global.queueManager = new QueueManager();
module.exports = { QueueManager, queueManager: global.queueManager };
