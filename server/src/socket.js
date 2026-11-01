import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { config } from './config.js';
import { verifyToken } from './middleware/auth.js';
import { Environment, Membership, Project } from './models/index.js';
import { projectRole } from './middleware/rbac.js';
import { subscribeLive } from './lib/live.js';
import { logger } from './lib/logger.js';

// Live event stream. Clients authenticate with a short-lived socket token and
// subscribe to environments they are authorized to view.
export async function attachSocket(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.webOrigin, credentials: true }, path: '/socket.io' });

  io.use((socket, next) => {
    try {
      const payload = verifyToken(socket.handshake.auth?.token, 'socket');
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', async ({ envId } = {}, ack) => {
      try {
        if (!mongoose.isValidObjectId(envId)) throw new Error('invalid environment');
        const env = await Environment.findById(envId).lean();
        if (!env) throw new Error('not found');
        const [project, membership] = await Promise.all([Project.findById(env.project).lean(), Membership.findOne({ org: env.org, user: socket.data.userId }).lean()]);
        if (!project || !membership || !projectRole(project, membership.role, socket.data.userId)) throw new Error('forbidden');
        for (const room of socket.rooms) if (room.startsWith('env:')) socket.leave(room);
        socket.join(`env:${envId}`);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });
    socket.on('unsubscribe', () => {
      for (const room of socket.rooms) if (room.startsWith('env:')) socket.leave(room);
    });
  });

  await subscribeLive(({ envId, events }) => io.to(`env:${envId}`).emit('events', events));
  logger.info('live stream ready');
  return io;
}
