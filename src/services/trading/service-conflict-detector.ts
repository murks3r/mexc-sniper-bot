/**
 * Service Conflict Detector
 * 
 * Prevents multiple auto-sniping services from running simultaneously
 * to avoid resource conflicts and inconsistent behavior.
 */

class ServiceConflictDetector {
  private static instance: ServiceConflictDetector;
  private activeServices = new Set<string>();
  private conflictLog: Array<{ service: string; timestamp: Date; action: string }> = [];

  private constructor() {}

  static getInstance(): ServiceConflictDetector {
    if (!ServiceConflictDetector.instance) {
      ServiceConflictDetector.instance = new ServiceConflictDetector();
    }
    return ServiceConflictDetector.instance;
  }

  /**
   * Register a service as active
   */
  registerService(serviceName: string): boolean {
    // Check for conflicts
    const conflicts = this.detectConflicts(serviceName);
    if (conflicts.length > 0) {
      console.error(`🚨 SERVICE CONFLICT DETECTED: ${serviceName}`, {
        conflictingServices: conflicts,
        currentlyActive: Array.from(this.activeServices)
      });
      
      this.conflictLog.push({
        service: serviceName,
        timestamp: new Date(),
        action: 'registration_blocked_conflict'
      });
      
      return false;
    }

    this.activeServices.add(serviceName);
    this.conflictLog.push({
      service: serviceName,
      timestamp: new Date(),
      action: 'registered'
    });

    console.info(`✅ Service registered: ${serviceName}`, {
      totalActiveServices: this.activeServices.size
    });

    return true;
  }

  /**
   * Unregister a service
   */
  unregisterService(serviceName: string): void {
    this.activeServices.delete(serviceName);
    this.conflictLog.push({
      service: serviceName,
      timestamp: new Date(),
      action: 'unregistered'
    });

    console.info(`🔄 Service unregistered: ${serviceName}`, {
      remainingServices: Array.from(this.activeServices)
    });
  }

  /**
   * Detect conflicts for a given service
   */
  private detectConflicts(serviceName: string): string[] {
    const autoSnipingServices = [
      'AutoSnipingModule',
      'CompleteAutoSnipingService', 
      'UnifiedAutoSnipingOrchestrator',
      'AutoSnipingCoordinator',
      'AutoSnipingModuleRefactored'
    ];

    if (autoSnipingServices.includes(serviceName)) {
      return Array.from(this.activeServices).filter(active => 
        autoSnipingServices.includes(active) && active !== serviceName
      );
    }

    return [];
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      activeServices: Array.from(this.activeServices),
      hasConflicts: this.hasActiveConflicts(),
      conflictLog: this.conflictLog.slice(-10), // Last 10 events
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Check if there are active conflicts
   */
  hasActiveConflicts(): boolean {
    const autoSnipingServices = Array.from(this.activeServices).filter(service =>
      service.includes('AutoSniping') || service.includes('Sniping')
    );
    return autoSnipingServices.length > 1;
  }

  /**
   * Get recommendations for resolving conflicts
   */
  private getRecommendations(): string[] {
    const recommendations = [];
    
    if (this.hasActiveConflicts()) {
      recommendations.push("Multiple auto-sniping services detected. Use only AutoSnipingModule from consolidated/core-trading.");
      recommendations.push("Stop other auto-sniping services to prevent conflicts.");
    }

    if (this.activeServices.size === 0) {
      recommendations.push("No auto-sniping services active. Initialize AutoSnipingModule through CoreTradingService.");
    }

    return recommendations;
  }

  /**
   * Force reset all services (emergency use)
   */
  reset(): void {
    const previousServices = Array.from(this.activeServices);
    this.activeServices.clear();
    
    console.warn(`🔄 FORCED RESET: Cleared all active services`, {
      previousServices,
      timestamp: new Date().toISOString()
    });

    this.conflictLog.push({
      service: 'SYSTEM',
      timestamp: new Date(),
      action: 'forced_reset'
    });
  }
}

export const serviceConflictDetector = ServiceConflictDetector.getInstance();

/**
 * Decorator to automatically register/unregister services
 */
export function preventServiceConflicts(serviceName: string) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    return class extends constructor {
      constructor(...args: any[]) {
        super(...args);
        
        // Register service
        const registered = serviceConflictDetector.registerService(serviceName);
        if (!registered) {
          throw new Error(`Service conflict detected: ${serviceName} cannot start because conflicting services are active.`);
        }
      }

      destroy() {
        serviceConflictDetector.unregisterService(serviceName);
        if (super.destroy) {
          super.destroy();
        }
      }
    };
  };
} 