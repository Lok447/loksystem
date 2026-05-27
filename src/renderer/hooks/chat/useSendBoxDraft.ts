import type { TChatConversation } from '@/common/config/storage';
import { useCallback } from 'react';
import useSWR from 'swr';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
export type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

type Draft =
  | {
      _type: 'gemini';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'claude';
      content: unknown;
    }
  | {
      _type: 'acp';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'codex';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'openclaw-gateway';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'nanobot';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'remote';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'aionrs';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    };

type DraftStoreKey = Exclude<TChatConversation['type'], 'gemini'>;
type DraftByType<K extends TChatConversation['type']> =
  K extends 'gemini' ? Extract<Draft, { _type: 'gemini' | 'aionrs' }> : Extract<Draft, { _type: K }>;

/**
 * 当前支持的对话类型以及对应的草稿对象
 */
const store: Record<DraftStoreKey, Map<string, Draft>> = {
  acp: new Map(),
  codex: new Map(),
  'openclaw-gateway': new Map(),
  nanobot: new Map(),
  remote: new Map(),
  aionrs: new Map(),
};

const normalizeDraftType = (type: TChatConversation['type']): DraftStoreKey => (type === 'gemini' ? 'aionrs' : type);

const setDraft = (
  type: TChatConversation['type'],
  conversation_id: string,
  draft: Draft | undefined
) => {
  const normalizedType = normalizeDraftType(type);
  if (draft) {
    const draftType = (draft as { _type?: string })._type;
    const normalizedDraft =
      normalizedType === 'aionrs' && draftType === 'gemini' ? ({ ...draft, _type: 'aionrs' } as Draft) : (draft as Draft);
    store[normalizedType].set(conversation_id, normalizedDraft as Draft);
  } else {
    store[normalizedType].delete(conversation_id);
  }
};

const getDraft = <K extends TChatConversation['type']>(type: K, conversation_id: string): DraftByType<K> | undefined => {
  return store[normalizeDraftType(type)].get(conversation_id) as DraftByType<K> | undefined;
};

/**
 * 获得一种类型下的会话草稿操作的 React Hook
 */
export const getSendBoxDraftHook = <K extends TChatConversation['type']>(
  type: K,
  initialValue: DraftByType<K>
) => {
  function useDraft(conversation_id: string) {
    const swrRet = useSWR([`/send-box/${type}/draft/${conversation_id}`, conversation_id], ([_, id]) => {
      return getDraft(type, id);
    });

    const mutateDraft = useCallback(
      (draft: (k: DraftByType<K>) => DraftByType<K> | undefined): void => {
        swrRet
          .mutate(
            (prev) => {
              const newDraft = draft((prev as DraftByType<K> | undefined) ?? initialValue);
              setDraft(type, conversation_id, newDraft);
              return newDraft;
            },
            { revalidate: false }
          )
          .catch((error) => {
            console.error('Failed to mutate draft:', error);
          });
      },
      [conversation_id]
    );

    return {
      get data() {
        return swrRet.data as DraftByType<K> | undefined;
      },
      mutate: mutateDraft,
    };
  }

  return useDraft;
};
