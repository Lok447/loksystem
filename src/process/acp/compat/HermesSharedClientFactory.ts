import type { AcpClient, ClientFactory } from '@process/acp/infra/IAcpClient';
import type { AgentConfig, ProtocolHandlers } from '@process/acp/types';
import { HermesSharedClient, HermesSharedRuntimeService } from './HermesSharedRuntimeService';

export class HermesSharedClientFactory implements ClientFactory {
  create(config: AgentConfig, handlers: ProtocolHandlers): AcpClient {
    return new HermesSharedClient(HermesSharedRuntimeService.getInstance(), config, handlers);
  }
}
