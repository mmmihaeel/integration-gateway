import { ValidationError } from '../../domain/errors.js';
import { AcmeNormalizer } from './acme-normalizer.js';
import { GlobexNormalizer } from './globex-normalizer.js';
import type { ProviderNormalizer } from './provider-normalizer.js';

export class NormalizerRegistry {
  private readonly normalizers = new Map<string, ProviderNormalizer>();

  constructor() {
    const instances: ProviderNormalizer[] = [new AcmeNormalizer(), new GlobexNormalizer()];
    for (const normalizer of instances) {
      this.normalizers.set(normalizer.provider, normalizer);
    }
  }

  get(provider: string): ProviderNormalizer {
    const normalizer = this.normalizers.get(provider);
    if (!normalizer) {
      throw new ValidationError(`Unsupported webhook provider: ${provider}`);
    }

    return normalizer;
  }
}
