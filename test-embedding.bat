@echo off
echo Testing Embedding Generation with Team Achievement
echo.
echo Context:
echo   Geography: worldwide
echo   Org Type: non_profit
echo   Subject: team
echo.

curl -X POST http://localhost:8000/api/generate-embedding ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: stevie-internal-key-2024-secure" ^
  -d "{\"text\":\"Organization: Jyothishmathi Institute of Technology and Science in worldwide. Type: non_profit, Size: medium. Nominating: team. Achievement: Our team at Jyothishmathi Institute of Technology and Science came together with a shared goal: to build a solution that addressed a real operational challenge, not just complete an academic requirement. We identified inefficiencies in existing workflows, aligned on a clear outcome, and executed the project like a business initiative from problem discovery and planning to delivery and validation. Each member contributed across strategy, execution, and problem-solving, allowing us to move quickly while maintaining quality. The result was a working system that streamlined processes, reduced manual effort, and demonstrated measurable value to its users. What makes this team exceptional is our ability to collaborate across roles, adapt under pressure, and deliver results with limited resources the same capabilities required to build successful products and organizations. This achievement reflects not only what we built, but how we worked together to make it happen. Focus areas: innovation, teamwork, problem_solving, project_management, operational_excellence.\",\"model\":\"text-embedding-3-small\"}"

echo.
echo.
echo If you see an embedding array above, the Python service is working!
echo Next step: Apply the SQL fix in Supabase to fix the geography filter.
pause
