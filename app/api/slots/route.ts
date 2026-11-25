import { NextResponse } from 'next/server'
function retired() {return NextResponse.json({error:'This legacy endpoint is retired. Use the authenticated application.'},{status:410})}
export const GET=retired
export const POST=retired
export const PUT=retired
