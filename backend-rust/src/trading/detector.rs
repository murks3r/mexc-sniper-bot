/// Pattern Detector für Auto-Sniping
/// Erkenne Patterns: sts:2, st:2, tt:4
pub struct PatternDetector {
    min_confidence: f64,
}

impl PatternDetector {
    pub fn new(min_confidence: f64) -> Self {
        Self { min_confidence }
    }

    /// Erkenne Pattern aus Launch Kalender Daten
    pub fn detect_pattern(&self, token_name: &str, time_intervals: &[i64]) -> Option<DetectedPattern> {
        // STS:2 - Single Token, Two Spaces (3 Tokens, 2 Spaces)
        if self.is_sts_2_pattern(token_name, time_intervals) {
            return Some(DetectedPattern {
                pattern_type: "sts:2".to_string(),
                confidence: 0.95,
            });
        }

        // ST:2 - Single Token (2 Tokens, close timing)
        if self.is_st_2_pattern(token_name, time_intervals) {
            return Some(DetectedPattern {
                pattern_type: "st:2".to_string(),
                confidence: 0.85,
            });
        }

        // TT:4 - Two Tokens (4 Events)
        if self.is_tt_4_pattern(token_name, time_intervals) {
            return Some(DetectedPattern {
                pattern_type: "tt:4".to_string(),
                confidence: 0.75,
            });
        }

        None
    }

    fn is_sts_2_pattern(&self, _token: &str, intervals: &[i64]) -> bool {
        // STS:2 = 3 Launches mit konsistenten Abständen
        intervals.len() >= 3 && self.min_confidence >= 0.9
    }

    fn is_st_2_pattern(&self, _token: &str, intervals: &[i64]) -> bool {
        // ST:2 = 2 schnelle Launches desselben Tokens
        intervals.len() >= 2 && intervals.len() < 3 && self.min_confidence >= 0.8
    }

    fn is_tt_4_pattern(&self, _token: &str, intervals: &[i64]) -> bool {
        // TT:4 = 4 Token Launches
        intervals.len() == 4 && self.min_confidence >= 0.7
    }
}

#[derive(Debug, Clone)]
pub struct DetectedPattern {
    pub pattern_type: String,
    pub confidence: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pattern_detection() {
        let detector = PatternDetector::new(0.8);
        let intervals = vec![1000, 2000, 3000];
        let pattern = detector.detect_pattern("VFARM", &intervals);
        assert!(pattern.is_some());
    }
}
