//! Cost/time budget tracking.

use crate::PolicyError;
use hb_core::policy::CostLimit;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

/// Tracks accumulated cost and time against a budget.
#[derive(Debug)]
pub struct BudgetTracker {
    limit: CostLimit,
    elapsed_secs: Arc<AtomicU64>,
    spent_tokens: Arc<AtomicU64>,
}

impl BudgetTracker {
    pub fn new(limit: CostLimit) -> Self {
        Self {
            limit,
            elapsed_secs: Arc::new(AtomicU64::new(0)),
            spent_tokens: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Record elapsed seconds and check the budget.
    pub fn record_time(&self, secs: u64) -> Result<(), PolicyError> {
        let total = self.elapsed_secs.fetch_add(secs, Ordering::Relaxed) + secs;
        if let Some(max) = self.limit.max_execution_time_secs {
            if total > max {
                return Err(PolicyError::BudgetExceeded(format!(
                    "execution time {total}s exceeds limit {max}s"
                )));
            }
        }
        Ok(())
    }

    /// Record consumed tokens and check the budget.
    pub fn record_tokens(&self, tokens: u64) -> Result<(), PolicyError> {
        let total = self.spent_tokens.fetch_add(tokens, Ordering::Relaxed) + tokens;
        if let Some(max) = self.limit.max_tokens {
            if total > max {
                return Err(PolicyError::BudgetExceeded(format!(
                    "token usage {total} exceeds limit {max}"
                )));
            }
        }
        Ok(())
    }
}
