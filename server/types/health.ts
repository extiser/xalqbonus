export type DependencyState = 'up' | 'down' | 'timeout';

export interface ReadinessChecks {
  postgres: DependencyState;
  redis: DependencyState;
}

export interface ReadinessResult {
  status: 'ready' | 'not_ready';
  checks: ReadinessChecks;
}
