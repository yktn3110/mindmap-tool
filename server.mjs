import serverModule from './server.js';
const { createMindflowServer } = serverModule;
const server = createMindflowServer();

server.listen(4173, '127.0.0.1', () => console.log('Mindflow: http://127.0.0.1:4173'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
