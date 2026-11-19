import type {SearchVertical} from '@/lib/directory/search-schemas';
import {searchProblemText,type DirectorySearchPage} from '@/lib/directory/search-server';
import {SearchFilters} from './search-filters';
import {SearchResults} from './search-results';

/**
 * LOCAL PRO ONLY (multivertical F6): the two search slots of a section page (filters form + results), built from
 * the server result of loadDirectorySearch. Plain GET form and links: works without JavaScript.
 */
export function searchSlots({vertical,locale,page,basePath,title}:{vertical:SearchVertical;locale:string;page:DirectorySearchPage;basePath:string;title:string}){
 const en=locale==='en';
 const filters=<SearchFilters vertical={vertical} values={page.values} facets={page.ok?page.facets?.facets??null:null} locale={locale} action={basePath}/>;
 const results=page.ok
  ?<SearchResults result={page.result} locale={locale} basePath={basePath} params={page.values} title={title}/>
  :<p role="alert" data-search-problem={page.reason} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[#162543]">{searchProblemText(page.reason,en)}</p>;
 return {filters,results};
}
