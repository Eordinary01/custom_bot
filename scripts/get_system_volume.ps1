Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(System.IntPtr pNotify);
    int UnregisterControlChangeNotify(System.IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, System.Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, System.Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice {
    int Activate(ref System.Guid id, int clsCtx, System.IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out object ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
public class MMDeviceEnumeratorComObject {}

public class RealVolumeReader {
    public static int GetVolume() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev = null;
        // 0 = eRender, 1 = eMultimedia
        int hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        if (hr != 0 || dev == null) return -1;
        var iid = typeof(IAudioEndpointVolume).GUID;
        object o = null;
        // CLSCTX_ALL = 23
        dev.Activate(ref iid, 23, System.IntPtr.Zero, out o);
        var vol = (IAudioEndpointVolume)o;
        if (vol == null) return -1;
        float v = 0;
        vol.GetMasterVolumeLevelScalar(out v);
        return (int)System.Math.Round(v * 100);
    }
}
"@ -ErrorAction SilentlyContinue

try {
    $vol = [RealVolumeReader]::GetVolume()
    if ($vol -ge 0) {
        Write-Output $vol
    }
} catch {
    # Honest failure - no fake fallback
}
