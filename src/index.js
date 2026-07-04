#!/usr/bin/env node

const Server = require('./server');
const Scheduler = require('./scheduler');

console.log('🚀 Facebook Metrics Dashboard Starting...\n');

// Start API server
const server = new Server();
server.start(3000);

// Start scheduler
const scheduler = new Scheduler();
scheduler.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});
