import {useState, useRef, useCallback} from 'react';

import {fetchModels} from '../../../api/hf';
import {processHFSearchResults} from '../../../utils/hf';
import {HuggingFaceModel} from '../../../utils/types';

export interface CatalogQuery {
  search?: string;
  filter?: string;
  sort?: string;
  direction?: string;
  limit?: number;
}

const PAGE_LIMIT = 20;

/**
 * Self-contained HF catalog fetcher for the Hub. Deliberately independent of
 * HFStore so that browsing categories / featured rows never clobbers the
 * user's hand-tuned search session in the HF search sheet.
 */
export const useHfCatalog = () => {
  const [models, setModels] = useState<HuggingFaceModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextLinkRef = useRef<string | null>(null);

  const process = (raw: HuggingFaceModel[]) => processHFSearchResults(raw);

  const load = useCallback(async (query: CatalogQuery) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchModels({
        search: query.search || undefined,
        filter: query.filter || undefined,
        sort: query.sort || undefined,
        direction: query.direction || undefined,
        limit: query.limit ?? PAGE_LIMIT,
        full: true,
        config: true,
        authToken: null,
      });
      nextLinkRef.current = response.nextLink;
      const processed = process(response.models);
      setModels(processed);
      return processed;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setModels([]);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextLinkRef.current || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const response = await fetchModels({
        nextPageUrl: nextLinkRef.current,
        authToken: null,
      });
      nextLinkRef.current = response.nextLink;
      const processed = process(response.models);
      setModels(prev => [...prev, ...processed]);
    } catch {
      // Pagination is best-effort; keep the existing page on failure.
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore]);

  const hasMore = nextLinkRef.current != null;

  return {models, isLoading, isLoadingMore, error, load, loadMore, hasMore};
};
