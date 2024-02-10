namespace Apsy.Xi.Basic
{
    public class Node<T>
{
    public T Value { get; }
    public List<Node<T>> Neighbors { get; } = new();

    public Node(T value)
    {
        Value = value;
    }
}
}