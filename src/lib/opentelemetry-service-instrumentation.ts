/**
 * OpenTelemetry Service Instrumentation
 *
 * Stub implementation for service method instrumentation.
 * Real implementation would add OpenTelemetry tracing.
 */

export interface InstrumentServiceMethodConfig {
  serviceName: string;
  methodName: string;
  operationType?: string;
}

export function instrumentServiceMethod<T extends (...args: any[]) => any>(
  config: InstrumentServiceMethodConfig,
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
  return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    // Return descriptor as-is without instrumentation
    return descriptor;
  };
}
