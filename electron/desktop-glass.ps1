# Windows 10 compatibility path: SetWindowCompositionAttribute is undocumented.
# Keep it isolated and opt-in; Windows 11/macOS use Electron native APIs.
param([long]$WindowHandle, [ValidateSet(0,3)][int]$Mode=3)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AgentrixDesktopGlass {
 [StructLayout(LayoutKind.Sequential)] public struct Accent { public int State; public int Flags; public int Color; public int Animation; }
 [StructLayout(LayoutKind.Sequential)] public struct Data { public int Attribute; public IntPtr Policy; public int Size; }
 [DllImport("user32.dll")] public static extern int SetWindowCompositionAttribute(IntPtr window, ref Data data);
 public static bool Apply(long handle, int mode) {
  var accent = new Accent { State=mode, Flags=2, Color=0x01000000 };
  var pointer=Marshal.AllocHGlobal(Marshal.SizeOf(accent));
  try { Marshal.StructureToPtr(accent,pointer,false); var data=new Data { Attribute=19, Policy=pointer, Size=Marshal.SizeOf(accent) }; return SetWindowCompositionAttribute(new IntPtr(handle),ref data)!=0; }
  finally { Marshal.FreeHGlobal(pointer); }
 }
}
"@
if (-not [AgentrixDesktopGlass]::Apply($WindowHandle,$Mode)) { throw 'Native backdrop rejected' }
