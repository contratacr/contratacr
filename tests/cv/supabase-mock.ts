export function createClient() {
 return {
  rpc: () => Promise.resolve({data: null}),
  auth: { updateUser: () => Promise.resolve({error:null}), getUser: () => Promise.resolve({data:{user:{id:'00000000-0000-4000-8000-000000000002'}}}) },
  from: () => {
   let update: Record<string, unknown> = {};
   const result = () => {
    const denied = update.cv_profile && sessionStorage.getItem('cv-denied') === '1';
    if(update.cv_profile && !denied) sessionStorage.setItem('cv-saved',JSON.stringify(update.cv_profile));
    return {data:denied ? null : {id:'00000000-0000-4000-8000-000000000001'}, error:denied ? {message:'CV write denied'}: null};
   };
   const chain = {update: (value:Record<string,unknown>) => {update=value;return chain;}, eq:()=>chain, select:()=>chain, single:()=>Promise.resolve(result()), maybeSingle:()=>Promise.resolve(result()), then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
   return chain;
  }
 };
}
