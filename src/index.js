#!/usr/bin/env node

const Server = require('./server');
const Scheduler = require('./scheduler');
const config = require('./config');

console.log('Marketing Reporting Dashboard starting...\n');

const server = new Server();
server.start(config.server.port, config.server.host);

const scheduler = new Scheduler();
scheduler.start();

process.on('SIGINT', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nShutting down gracefully...');
  process.exit(0);
});
