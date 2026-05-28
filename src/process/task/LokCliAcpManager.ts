/**
 * @license
 * Copyright 2025 LokSystem (loksystem.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AcpAgentManager from './AcpAgentManager';

type LokCliAcpManagerData = ConstructorParameters<typeof AcpAgentManager>[0];

/**
 * LokCLI conversations now run on top of the Hermes ACP runtime, but keep a
 * dedicated `lokcli` task identity so renderer/process runtime state stays
 * aligned with the product concept instead of collapsing back to generic ACP.
 */
export class LokCliAcpManager extends AcpAgentManager {
  constructor(data: LokCliAcpManagerData) {
    super(data, 'lokcli');
  }
}
