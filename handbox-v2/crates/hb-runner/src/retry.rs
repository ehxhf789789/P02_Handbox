//! Retry logic with exponential backoff.

use hb_core::graph::RetryPolicy;
use std::time::Duration;

/// Compute the delay before retry attempt `attempt` (0-based).
pub fn compute_delay(policy: &RetryPolicy, attempt: u32) -> Duration {
    let delay_ms = (policy.backoff_ms as f64) * policy.backoff_multiplier.powi(attempt as i32);
    let capped = delay_ms.min(policy.max_backoff_ms as f64) as u64;
    Duration::from_millis(capped)
}

/// Check whether we should retry given the attempt number and policy.
pub fn should_retry(policy: &RetryPolicy, attempt: u32) -> bool {
    attempt < policy.max_retries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exponential_backoff() {
        let policy = RetryPolicy {
            max_retries: 5,
            backoff_ms: 1000,
            backoff_multiplier: 2.0,
            max_backoff_ms: 30_000,
        };

        assert_eq!(compute_delay(&policy, 0), Duration::from_millis(1000));
        assert_eq!(compute_delay(&policy, 1), Duration::from_millis(2000));
        assert_eq!(compute_delay(&policy, 2), Duration::from_millis(4000));
        assert_eq!(compute_delay(&policy, 3), Duration::from_millis(8000));
        assert_eq!(compute_delay(&policy, 4), Duration::from_millis(16000));
        // Capped at 30s
        assert_eq!(compute_delay(&policy, 5), Duration::from_millis(30000));
    }

    #[test]
    fn retry_limit() {
        let policy = RetryPolicy::default(); // max_retries = 3
        assert!(should_retry(&policy, 0));
        assert!(should_retry(&policy, 2));
        assert!(!should_retry(&policy, 3));
    }
}
