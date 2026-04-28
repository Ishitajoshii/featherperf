export default {
  include: ['src/pages/'],
  exclude: [/hero/i],
  criticalSelectors: ['body', 'main', '.hero'],
  postLoadDelayMs: 2000,
  interactionQuietWindowMs: 1000
};
