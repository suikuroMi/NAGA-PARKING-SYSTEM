import { useAuth, logout, touchAdmin as serverTouch } from '../store/store'
export const useAdminSignedIn = () => useAuth().role === 'admin'
export function adminSignIn() {}
export const adminSignOut = () => logout()
let last=0
export function touchAdmin() {if(Date.now()-last<60000)return;last=Date.now();void serverTouch().catch(()=>{})}
