export const REQUEST_DEADLINE_MS = 10000

/** Deadline includes both receiving headers and decoding the response body. */
export async function requestJson(url:string,init:RequestInit={},timeoutMs=REQUEST_DEADLINE_MS) {
  const controller=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined
  const deadline=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{
      reject(new Error('The action was not confirmed within 10 seconds. Reconnect and retry the same action.'))
      controller.abort()
    },timeoutMs)
  })
  try {
    return await Promise.race([deadline,(async()=>{
      const response=await fetch(url,{...init,signal:controller.signal})
      return {ok:response.ok,status:response.status,data:await response.json()}
    })()])
  }finally{clearTimeout(timer)}
}
