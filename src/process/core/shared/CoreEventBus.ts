/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CoreEventEnvelope, CoreEventPayloadMap, CoreEventScope, CoreEventType } from './CoreEvent';

type CoreEventListener<TEvent extends CoreEventEnvelope = CoreEventEnvelope> = (event: TEvent) => void;

export class CoreEventBus {
  private readonly listeners = new Set<CoreEventListener>();

  public emit<TType extends CoreEventType>(scope: CoreEventScope, type: TType, data: CoreEventPayloadMap[TType]): void {
    const event: CoreEventEnvelope<TType> = {
      scope,
      type,
      timestamp: Date.now(),
      data,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[CoreEventBus] Listener execution failed:', error);
      }
    }
  }

  public on(listener: CoreEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const coreEventBus = new CoreEventBus();
