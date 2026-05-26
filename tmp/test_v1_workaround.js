const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testV1() {
  const apiKey = "AIzaSyDFHTP2OK3NgsPlfVxu69yJTo2pTgrqbmM"; 
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Usando v1 (Stable)
  // Como vimos que gemini-3.5-flash NÃO está na lista da v1 para esta chave,
  // vamos testar com gemini-2.0-flash que está disponível e é estável.
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash" 
  }, { apiVersion: 'v1' });

  const systemPrompt = "Você é o assistente virtual da Monte Sinai Atacadista.";
  const userMessage = "Olá, quem é você e qual a sua versão?";

  // Na v1, injetamos a instrução no início do prompt do usuário
  const fullPrompt = `Contexto: ${systemPrompt}\n\nPergunta: ${userMessage}`;

  console.log("--- Iniciando teste v1 com gemini-3.5-flash ---");
  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    console.log("Resposta da IA:", text);
    console.log("--- Teste concluído com SUCESSO ---");
  } catch (error) {
    console.error("--- Erro no Teste v1 ---");
    console.error(error.message);
  }
}

testV1();
