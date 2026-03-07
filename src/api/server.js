import('./server.ts').catch((error) => {
  console.error('Unable to start API service', error);
  process.exit(1);
});
