import('./worker.ts').catch((error) => {
  console.error('Unable to start worker service', error);
  process.exit(1);
});
