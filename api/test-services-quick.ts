import { openaiService } from './src/services/openaiService';
import { embeddingManager } from './src/services/embeddingManager';

async function testServices() {
  console.log('Testing OpenAI Service...');
  try {
    const embedding = await openaiService.generateEmbedding('test');
    console.log('✅ OpenAI embedding works, dimension:', embedding.length);
  } catch (error: any) {
    console.error('❌ OpenAI embedding failed:', error.message);
  }

  console.log('\nTesting Embedding Manager...');
  try {
    const context = {
      nomination_subject: 'team',
      description: 'We built an AI-powered smart mirror',
      org_type: 'startup',
      org_size: 'small',
      achievement_focus: ['Innovation', 'Technology'],
    };
    const embedding = await embeddingManager.generateUserEmbedding(context);
    console.log('✅ Embedding Manager works, dimension:', embedding.length);
  } catch (error: any) {
    console.error('❌ Embedding Manager failed:', error.message);
  }
}

testServices().catch(console.error);
