class SchedulerManager {
    constructor() {
        this.intervals = new Map();
        this.timeouts = new Map();
    }
    
    registerInterval(name, ms, callback) {
        this.clearInterval(name);
        const t = setInterval(async () => {
            try { await callback(); } 
            catch (e) { console.error(`[Scheduler] Interval error (${name}):`, e); }
        }, ms);
        this.intervals.set(name, t);
        return t;
    }
    
    registerTimeout(name, ms, callback) {
        this.clearTimeout(name);
        const t = setTimeout(async () => {
            this.timeouts.delete(name);
            try { await callback(); } 
            catch (e) { console.error(`[Scheduler] Timeout error (${name}):`, e); }
        }, ms);
        this.timeouts.set(name, t);
        return t;
    }
    
    clearInterval(name) {
        if (this.intervals.has(name)) {
            clearInterval(this.intervals.get(name));
            this.intervals.delete(name);
        }
    }
    
    clearTimeout(name) {
        if (this.timeouts.has(name)) {
            clearTimeout(this.timeouts.get(name));
            this.timeouts.delete(name);
        }
    }
    
    clearAll() {
        for (const t of this.intervals.values()) clearInterval(t);
        for (const t of this.timeouts.values()) clearTimeout(t);
        this.intervals.clear();
        this.timeouts.clear();
    }
}

global.scheduler = new SchedulerManager();
module.exports = { SchedulerManager, scheduler: global.scheduler };
