import { BookOpen } from 'lucide-react';
import { PagePlaceholder } from '../fer/components/PagePlaceholder';

export function NormativaPage() {
  return (
    <PagePlaceholder
      title="Normativa"
      description="Reglas y normativa del FER CUP"
      icon={BookOpen}
    />
  );
}

export default NormativaPage;
