// services/adapters/adapter.registry.ts
// Adapter registry: provider_type -> adapter instance

import { IProviderAdapter } from './adapter.interface';
import { OpenAIAdapter } from './openai.adapter';
import { RelayAdapter } from './relay.adapter';
import { OpenAICompatibleAdapter } from './openai-compatible.adapter';
import { CustomAdapter } from './custom.adapter';
import { XiaomaAdapter } from './xiaoma.adapter';
import { BagegeAdapter } from './bagege.adapter';
import { WellAPIAdapter } from './wellapi.adapter';
import { ApimartAdapter } from './apimart.adapter';
import { RunningHubAdapter } from './runninghub.adapter';

const registry = new Map<string, IProviderAdapter>();

function initRegistry(): void {
  if (registry.size > 0) return;
  registry.set('openai', new OpenAIAdapter());
  registry.set('relay', new RelayAdapter());
  registry.set('openai_compatible', new OpenAICompatibleAdapter());
  registry.set('custom', new CustomAdapter());
  registry.set('xiaoma', new XiaomaAdapter());
  registry.set('bagege', new BagegeAdapter());
  registry.set('wellapi', new WellAPIAdapter());
  registry.set('apimart', new ApimartAdapter());
  registry.set('runninghub', new RunningHubAdapter());
}

export class AdapterRegistry {
  /** Get adapter by provider_type. Returns null if unsupported. */
  static get(providerType: string): IProviderAdapter | null {
    initRegistry();
    return registry.get(providerType) || null;
  }

  /** Register a custom adapter (for testing / extension) */
  static register(providerType: string, adapter: IProviderAdapter): void {
    registry.set(providerType, adapter);
  }

  /** List all registered provider types */
  static list(): string[] {
    initRegistry();
    return [...registry.keys()];
  }
}
