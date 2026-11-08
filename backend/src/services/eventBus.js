import { EventEmitter } from 'node:events';
import { Event } from '../models/Event.js';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let published = 0;

export const eventBus = {
  publish(type, data) {
    const json = JSON.stringify(data);
    const id = Event.append(type, json);
    if (++published % 200 === 0) Event.pruneUpTo(id - 1000); 
    emitter.emit('event', { id, type, data: json });
    return id;
  },
  since: Event.since,
  lastId: Event.lastId,
  on: (name, fn) => emitter.on(name, fn),
};
