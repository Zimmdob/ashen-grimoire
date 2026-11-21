// electron-builder afterPack: put the Ashen Grimoire icon and name on the Windows .exe.
// (signAndEditExecutable is off so the build needs no Windows-only tools; resedit is pure JS.)
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const R = ResEdit.default ?? ResEdit;
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const data = fs.readFileSync(exe);
  const pe = R.NtExecutable.from(data, { ignoreCert: true });
  const res = R.NtExecutableResource.from(pe);
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.ico')));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  const vi = R.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const ver = ctx.packager.appInfo.version;
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: 'Ashen Grimoire', FileDescription: 'Ashen Grimoire', CompanyName: 'Dean Knipe', OriginalFilename: 'Ashen Grimoire.exe' });
    const [a, b, c] = ver.split('.').map(Number);
    vi.setFileVersion(a, b, c, 0, 1033);
    vi.setProductVersion(a, b, c, 0, 1033);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • set icon and version info on', path.basename(exe));
};
