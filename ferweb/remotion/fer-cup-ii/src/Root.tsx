import {Composition} from 'remotion';
import {FerCupIITiktok} from './FerCupIITiktok';

export function RemotionRoot() {
  return (
    <Composition
      id="FerCupIITiktok"
      component={FerCupIITiktok}
      durationInFrames={600}
      fps={30}
      width={1080}
      height={1920}
    />
  );
}
