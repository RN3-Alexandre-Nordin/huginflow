const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testV1() {
  const apiKey = "AIzaSyDFHTP2OK3NgsPlfVxu69yJTo2pTgrqbmM"; 
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Testando com gemini-3.5-flash-latest na v1
  const model = genAI.getGenerativeModel({ 
    model: "gemini-3.5-flash" 
  }, { apiVersion: 'v1' });

  const systemInstructions = "Você é um assistente virtual.";
  const message = "Olá!";
  const fullPrompt = `INSTRUÇÕES: ${systemInstructions}\n\nPERGUNTA: ${message}`;

  console.log("--- Testando v1 com gemini-3.5-flash ---");
  try {
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    console.log("Resposta:", response.text());
    console.log("--- SUCESSO ---");
  } catch (error) {
    console.error("--- FALHA ---");
    console.error(error.message);
  }
}

testV1();
