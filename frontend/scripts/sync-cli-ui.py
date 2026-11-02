#!/usr/bin/env python3
"""Vendor shared CLI UI sources; --check verifies the snapshot against an upstream checkout."""
from pathlib import Path
import argparse, hashlib, json, shutil
parser=argparse.ArgumentParser();parser.add_argument('--source',default='/www/wwwroot/cli.tnvn.pw/frontend');parser.add_argument('--check',action='store_true');args=parser.parse_args()
source=Path(args.source);target=Path(__file__).resolve().parents[1]/'shared/cli-ui';files=[]
for name in ['Button.tsx','Input.tsx','Card.tsx','EmptyState.tsx','LoadingSpinner.tsx','Modal.tsx','Select.tsx','Select.module.scss','ToggleSwitch.tsx','ToggleSwitch.module.scss','icons.tsx','scrollLock.ts']:
 files.append('src/components/ui/'+name)
for name in ['variables.scss','themes.scss','mixins.scss','components.scss']:
 files.append('src/styles/'+name)
for f in (source/'src/components/ui/Skeleton').iterdir():
 if f.is_file():files.append(str(f.relative_to(source)))
manifest={}
for name in files:
 data=(source/name).read_bytes();manifest[name]=hashlib.sha256(data).hexdigest();dest=target/name
 if args.check:
  if not dest.exists() or dest.read_bytes()!=data:raise SystemExit('Upstream differs: '+name)
 else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
if not args.check:(target/'UPSTREAM.json').write_text(json.dumps({'source':'thinisis CLI Proxy API frontend','files':manifest},indent=2)+'\n')
print(('Verified' if args.check else 'Synced')+' '+str(len(files))+' shared CLI UI source files')
